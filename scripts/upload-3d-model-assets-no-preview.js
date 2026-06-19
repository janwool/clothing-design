require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const db = require('../lib/db');

const sourceRoot = path.join(process.env.HOME || '/Users/chengwuxue', '3D模型');
const bucketName = process.env.R2_BUCKET || 'clothing-design';

const categories = [
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
  { name: 'Top', slug: 'top', sort_order: 140 }
];

function required(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
  return process.env[name];
}

function publicUrl(key) {
  const base = process.env.R2_PUBLIC_URL;
  if (base) {
    return `${base.replace(/\/+$/, '')}/${key}`;
  }
  return `https://${bucketName}.${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${key}`;
}

function s3Client() {
  const accountId = required('R2_ACCOUNT_ID');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY')
    }
  });
}

function titleCase(value) {
  return String(value)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function stableSlug(category, index, relativeId) {
  const hash = crypto.createHash('sha1').update(relativeId).digest('hex').slice(0, 8);
  return `${category.slug}-3d-model-${String(index).padStart(2, '0')}-${hash}`;
}

function buildDescription(categoryName) {
  return [
    `${categoryName} 3D clothing model with a matching packed UV pattern SVG for browser-based apparel design.`,
    `Use it for custom garment mockups, product presentation, colorway exploration, ecommerce previews, and design review workflows.`,
    `The GLB model and SVG pattern are generated from the same packed UV layout so artwork placement can align between the 2D pattern and 3D preview.`
  ].join('\n\n');
}

function buildTags(categoryName) {
  return [
    categoryName,
    'Design 3D',
    '3D clothing model',
    'apparel mockup',
    'GLB model',
    'UV pattern SVG',
    'packed UV',
    'custom clothing design'
  ].join(', ');
}

function categoryDescription(categoryName) {
  return `${categoryName} Design 3D models with GLB files and matching packed UV SVG templates for online apparel mockups.`;
}

function categoryMetaTitle(categoryName) {
  return `${categoryName} 3D Models with UV Pattern SVGs`;
}

function categoryMetaDescription(categoryName) {
  return `Browse ${categoryName} GLB clothing models with aligned packed UV SVG files for custom apparel design and browser-based mockups.`;
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

  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_categories (
    model_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_id, category_id)
  )`);
}

async function upsertCategory(category) {
  const existing = await db.get(
    'SELECT id, resource_type FROM categories WHERE slug = ?',
    [category.slug]
  );
  const params = [
    category.name,
    category.slug,
    '3d-models',
    categoryDescription(category.name),
    categoryMetaTitle(category.name),
    categoryMetaDescription(category.name),
    category.sort_order,
    'active'
  ];

  if (existing) {
    if (existing.resource_type !== '3d-models') {
      throw new Error(`Category slug ${category.slug} already belongs to ${existing.resource_type}`);
    }
    await db.run(
      `UPDATE categories
       SET name = ?, slug = ?, resource_type = ?, description = ?, meta_title = ?, meta_description = ?,
           sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existing.id]
    );
    return existing.id;
  }

  const result = await db.run(
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return result.lastID;
}

async function uploadFile(client, sourcePath, key, contentType, dryRun) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!['.glb', '.svg'].includes(extension)) {
    throw new Error(`Refusing to upload non-model asset: ${sourcePath}`);
  }
  if (!dryRun) {
    const body = await fs.readFile(sourcePath);
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    }));
  }
  return publicUrl(key);
}

async function collectModels() {
  const models = [];
  for (const category of categories) {
    const categoryDir = path.join(sourceRoot, category.name);
    let entries = [];
    try {
      entries = await fs.readdir(categoryDir, { withFileTypes: true });
    } catch {
      continue;
    }
    const dirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

    let index = 0;
    for (const folderName of dirs) {
      const dir = path.join(categoryDir, folderName);
      const glbPath = path.join(dir, 'model_packed_uv.glb');
      const svgPath = path.join(dir, 'pattern.svg');
      try {
        await fs.access(glbPath);
        await fs.access(svgPath);
      } catch {
        continue;
      }
      index += 1;
      const relativeId = `${category.name}/${folderName}`;
      const slug = stableSlug(category, index, relativeId);
      models.push({
        category,
        folderName,
        slug,
        name: `${titleCase(category.name)} 3D Model ${String(index).padStart(2, '0')}`,
        glbPath,
        svgPath
      });
    }
  }
  return models;
}

async function upsertModel(model, categoryId, glbUrl, textureUrl, dryRun) {
  if (dryRun) return 'dry-run';

  const existing = await db.get('SELECT id, image_url FROM models_3d WHERE slug = ?', [model.slug]);
  const params = [
    model.name,
    model.slug,
    model.category.name,
    buildDescription(model.category.name),
    buildTags(model.category.name),
    glbUrl,
    textureUrl,
    'active'
  ];

  let modelId;
  if (existing) {
    modelId = existing.id;
    await db.run(
      `UPDATE models_3d
       SET name = ?, slug = ?, category = ?, description = ?, tags = ?,
           file_url = ?, texture_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, modelId]
    );
  } else {
    await db.run(
      `INSERT INTO models_3d (name, slug, category, description, tags, file_url, texture_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );
    const inserted = await db.get('SELECT id FROM models_3d WHERE slug = ?', [model.slug]);
    if (!inserted) {
      throw new Error(`Inserted model could not be found by slug: ${model.slug}`);
    }
    modelId = inserted.id;
  }

  await db.run('DELETE FROM model_3d_categories WHERE model_id = ?', [modelId]);
  await db.run(
    'INSERT INTO model_3d_categories (model_id, category_id, is_primary) VALUES (?, ?, ?)',
    [modelId, categoryId, 1]
  );

  return existing ? 'updated' : 'inserted';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const dbOnly = process.argv.includes('--db-only');
  const models = await collectModels();
  const client = s3Client();
  const counts = { inserted: 0, updated: 0, 'dry-run': 0 };

  await ensureSchema();
  const categoryIds = new Map();
  for (const category of categories) {
    if (models.some(model => model.category.name === category.name)) {
      const id = dryRun ? 0 : await upsertCategory(category);
      categoryIds.set(category.name, id);
    }
  }

  console.log(`${dryRun ? 'Would upload' : dbOnly ? 'Repairing DB for' : 'Uploading'} ${models.length} GLB/SVG pairs from ${sourceRoot}`);
  for (const model of models) {
    const glbKey = `d3/3d-models/${model.category.slug}/${model.slug}.glb`;
    const svgKey = `d2/3d-models/${model.category.slug}/${model.slug}.svg`;
    const glbUrl = await uploadFile(client, model.glbPath, glbKey, 'model/gltf-binary', dryRun || dbOnly);
    const textureUrl = await uploadFile(client, model.svgPath, svgKey, 'image/svg+xml', dryRun || dbOnly);
    const result = await upsertModel(model, categoryIds.get(model.category.name), glbUrl, textureUrl, dryRun);
    counts[result] += 1;
    console.log(`${result}: ${model.category.name}/${model.folderName} -> ${model.slug}`);
  }

  console.log(`Done: ${JSON.stringify(counts)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
