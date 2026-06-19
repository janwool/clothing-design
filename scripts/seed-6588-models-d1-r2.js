require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const db = require('../lib/db');

const sourceRoot = '/Users/chengwuxue/Downloads/6588';
const metadataPath = path.join(sourceRoot, 'seo_geo_models.json');
const bucketName = 'clothing-design';

const categoryById = new Proxy({}, { get: () => 'T-shirt' });

const categories = [
  {
    name: 'T-Shirts',
    slug: 't-shirts',
    sort_order: 10,
    description: 'Editable 3D T-shirt, pullover, long sleeve, and casual top models for custom apparel design.',
    meta_title: '3D T-Shirt Models for Custom Apparel Design',
    meta_description: 'Browse web-ready 3D T-shirt and casual top GLB models with aligned UV pattern SVG files for apparel customization.'
  },
  {
    name: 'Polo Shirts',
    slug: 'polo-shirts',
    sort_order: 20,
    description: 'Collared polo shirt 3D models for uniforms, teamwear, branded apparel, and ecommerce mockups.',
    meta_title: '3D Polo Shirt Models with UV Pattern Templates',
    meta_description: 'Use editable 3D polo shirt GLB models with UV pattern SVGs for teamwear, uniforms, and apparel branding.'
  },
  {
    name: 'Activewear',
    slug: 'activewear',
    sort_order: 30,
    description: 'Performance-inspired 3D tops including base layers, turtlenecks, and quarter-zip garments.',
    meta_title: '3D Activewear Models for Fashion Mockups',
    meta_description: 'Download activewear-style 3D garment models with packed UVs for sportswear, outdoor apparel, and technical clothing previews.'
  },
  {
    name: 'Women Shirts',
    slug: 'women-shirts',
    sort_order: 40,
    description: 'Women blouse and shirt 3D models with editable UV layouts for boutique fashion and digital sampling.',
    meta_title: 'Women Shirt 3D Models with Editable UV Patterns',
    meta_description: 'Browse women blouse, button shirt, puff sleeve, tie-neck, and fashion top 3D models with GLB files and pattern SVGs.'
  },
  {
    name: 'Women Dresses',
    slug: 'women-dresses',
    sort_order: 50,
    description: 'Women shirt dress and wrap dress 3D models for fashion ecommerce, digital lookbooks, and custom textile previews.',
    meta_title: 'Women Dress 3D Models with GLB and UV Pattern SVG',
    meta_description: 'Use women dress and shirt dress 3D GLB models with aligned UV pattern SVGs for digital fashion previews.'
  }
];

function getRequiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
  return process.env[name];
}

function getPublicUrl(key) {
  const publicBase = process.env.R2_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase.replace(/\/+$/, '')}/${key}`;
  }
  return `https://${bucketName}.${getRequiredEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${key}`;
}

function getS3Client() {
  const accountId = getRequiredEnv('R2_ACCOUNT_ID');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY')
    }
  });
}

async function uploadAsset(client, relativeSource, key, contentType) {
  const body = await fs.readFile(path.join(sourceRoot, relativeSource));
  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
  return getPublicUrl(key);
}

function buildDescription(model) {
  const useCases = (model.use_cases || []).join(', ');
  const faq = (model.faq || [])
    .map(item => `${item.question} ${item.answer}`)
    .join(' ');
  return [model.description, useCases ? `Use cases: ${useCases}.` : '', faq].filter(Boolean).join('\n\n');
}

async function ensureSchema() {
  await db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    resource_type TEXT NOT NULL,
    description TEXT,
    meta_title TEXT,
    meta_description TEXT,
    landing_content TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run('ALTER TABLE categories ADD COLUMN landing_content TEXT').catch(() => {});

  await db.run(`CREATE TABLE IF NOT EXISTS models_3d (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT,
    category TEXT NOT NULL,
    description TEXT,
    tags TEXT,
    image_url TEXT,
    file_url TEXT,
    texture_url TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run('ALTER TABLE models_3d ADD COLUMN slug TEXT').catch(() => {});
  await db.run('ALTER TABLE models_3d ADD COLUMN texture_url TEXT').catch(() => {});
}

async function upsertCategory(category) {
  const existing = await db.get('SELECT id FROM categories WHERE slug = ? AND resource_type = ?', [category.slug, '3d-models']);
  const params = [
    category.name,
    category.slug,
    '3d-models',
    category.description,
    category.meta_title,
    category.meta_description,
    category.sort_order,
    'active'
  ];

  if (existing) {
    await db.run(
      `UPDATE categories
       SET name = ?, slug = ?, resource_type = ?, description = ?, meta_title = ?, meta_description = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existing.id]
    );
    return;
  }

  await db.run(
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
}

async function upsertModel(client, model) {
  const category = categoryById[model.id] || 'T-Shirts';
  const glbUrl = await uploadAsset(client, model.assets.glb, `d3/6588/${model.slug}.glb`, 'model/gltf-binary');
  const previewUrl = await uploadAsset(client, model.assets.preview.replace('_pale_yellow.webp', '_white.webp'), `image/6588/${model.slug}.webp`, 'image/webp');
  const textureUrl = await uploadAsset(client, model.assets.pattern_svg, `d2/6588/${model.slug}.svg`, 'image/svg+xml');
  const tags = Array.from(new Set([...(model.tags || []), 'UV pattern SVG', 'packed UV', 'web-ready GLB'])).join(', ');
  const description = buildDescription(model);

  const existing = await db.get('SELECT id FROM models_3d WHERE slug = ?', [model.slug]);
  const params = [
    model.name,
    model.slug,
    category,
    description,
    tags,
    previewUrl,
    glbUrl,
    textureUrl,
    'active'
  ];

  if (existing) {
    await db.run(
      `UPDATE models_3d
       SET name = ?, slug = ?, category = ?, description = ?, tags = ?, image_url = ?, file_url = ?, texture_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existing.id]
    );
    return 'updated';
  }

  await db.run(
    `INSERT INTO models_3d (name, slug, category, description, tags, image_url, file_url, texture_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return 'inserted';
}

async function main() {
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  const client = getS3Client();
  const counts = { inserted: 0, updated: 0 };

  await ensureSchema();
  for (const category of categories) {
    await upsertCategory(category);
  }

  for (const model of metadata.models) {
    const result = await upsertModel(client, model);
    counts[result] += 1;
    console.log(`${result}: ${model.slug}`);
  }

  console.log(`Imported 6588 models to D1/R2: ${counts.inserted} inserted, ${counts.updated} updated`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
