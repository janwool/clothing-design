const fs = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const sourceRoot = '/Users/chengwuxue/Downloads/6588';
const metadataPath = path.join(sourceRoot, 'seo_geo_models.json');
const publicRoot = path.resolve(__dirname, '..', 'public');
const dbPath = path.resolve(__dirname, '..', 'database.sqlite');

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

function openDb() {
  return new sqlite3.Database(dbPath);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close(err => (err ? reject(err) : resolve()));
  });
}

async function ensureSchema(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS categories (
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
  await run(db, 'ALTER TABLE categories ADD COLUMN landing_content TEXT').catch(() => {});

  await run(db, `CREATE TABLE IF NOT EXISTS models_3d (
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
  await run(db, 'ALTER TABLE models_3d ADD COLUMN slug TEXT').catch(() => {});
  await run(db, 'ALTER TABLE models_3d ADD COLUMN texture_url TEXT').catch(() => {});
}

async function ensureDirectories() {
  await fs.mkdir(path.join(publicRoot, 'uploads', 'glb'), { recursive: true });
  await fs.mkdir(path.join(publicRoot, 'uploads', 'preview'), { recursive: true });
  await fs.mkdir(path.join(publicRoot, 'uploads', 'texture'), { recursive: true });
}

async function copyAsset(relativeSource, uploadFolder, filename) {
  const source = path.join(sourceRoot, relativeSource);
  const target = path.join(publicRoot, 'uploads', uploadFolder, filename);
  await fs.copyFile(source, target);
  return `/uploads/${uploadFolder}/${filename}`;
}

function buildDescription(model) {
  const useCases = (model.use_cases || []).join(', ');
  const faq = (model.faq || [])
    .map(item => `${item.question} ${item.answer}`)
    .join(' ');
  return [model.description, useCases ? `Use cases: ${useCases}.` : '', faq].filter(Boolean).join('\n\n');
}

async function upsertCategory(db, category) {
  const existing = await get(db, 'SELECT id FROM categories WHERE slug = ? AND resource_type = ?', [category.slug, '3d-models']);
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
    await run(
      db,
      `UPDATE categories
       SET name = ?, slug = ?, resource_type = ?, description = ?, meta_title = ?, meta_description = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existing.id]
    );
    return;
  }

  await run(
    db,
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
}

async function upsertModel(db, model) {
  const category = categoryById[model.id] || 'T-Shirts';
  const glbUrl = await copyAsset(model.assets.glb, 'glb', `${model.slug}.glb`);
  const previewUrl = await copyAsset(model.assets.preview.replace('_pale_yellow.webp', '_white.webp'), 'preview', `${model.slug}.webp`);
  const textureUrl = await copyAsset(model.assets.pattern_svg, 'texture', `${model.slug}.svg`);
  const tags = Array.from(new Set([...(model.tags || []), 'UV pattern SVG', 'packed UV', 'web-ready GLB'])).join(', ');
  const description = buildDescription(model);

  const existing = await get(db, 'SELECT id FROM models_3d WHERE slug = ?', [model.slug]);
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
    await run(
      db,
      `UPDATE models_3d
       SET name = ?, slug = ?, category = ?, description = ?, tags = ?, image_url = ?, file_url = ?, texture_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existing.id]
    );
    return 'updated';
  }

  await run(
    db,
    `INSERT INTO models_3d (name, slug, category, description, tags, image_url, file_url, texture_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return 'inserted';
}

async function main() {
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  const db = openDb();
  const counts = { inserted: 0, updated: 0 };

  try {
    await ensureSchema(db);
    await ensureDirectories();

    for (const category of categories) {
      await upsertCategory(db, category);
    }

    for (const model of metadata.models) {
      const result = await upsertModel(db, model);
      counts[result] += 1;
    }
  } finally {
    await closeDb(db);
  }

  console.log(`Imported 6588 models: ${counts.inserted} inserted, ${counts.updated} updated`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
