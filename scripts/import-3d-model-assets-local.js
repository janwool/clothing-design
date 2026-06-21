require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const {
  applyUniqueSeoNames,
  buildSeoContent,
  buildModelCategoryLandingContent,
  categoryDescription,
  categoryMetaDescription,
  categoryMetaTitle,
  design3dCategories,
  stableSlug
} = require('../lib/design3d-seo');

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

const db = require('../lib/db');

const sourceRoot = path.join(process.env.HOME || '/Users/chengwuxue', '3D模型');
const publicRoot = path.resolve(__dirname, '..', 'public');

const categories = design3dCategories.filter(category => (
  ['T-shirt', 'Shirt', 'Pants', 'Jacket', 'Hoodie', 'Dress', 'Cloak', 'Underwear', 'Jumpsuit', 'Skirt', 'Blazer', 'Coat', 'Hat', 'Top'].includes(category.name)
));

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

async function ensureDirectories() {
  await fs.mkdir(path.join(publicRoot, 'uploads', 'glb'), { recursive: true });
  await fs.mkdir(path.join(publicRoot, 'uploads', 'texture'), { recursive: true });
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
    JSON.stringify(buildModelCategoryLandingContent(category.name)),
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
           landing_content = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existing.id]
    );
    return existing.id;
  }

  const result = await db.run(
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return result.lastID;
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
        seo: buildSeoContent({ category, folderName, variantIndex: index - 1 }),
        glbPath,
        svgPath
      });
    }
  }
  return applyUniqueSeoNames(models);
}

async function copyAsset(sourcePath, folder, filename) {
  const target = path.join(publicRoot, 'uploads', folder, filename);
  await fs.copyFile(sourcePath, target);
  return `/uploads/${folder}/${filename}`;
}

async function upsertModel(model, categoryIds, glbUrl, textureUrl) {
  const existing = await db.get('SELECT id, image_url FROM models_3d WHERE slug = ?', [model.slug]);
  const params = [
    model.seo.name,
    model.slug,
    model.seo.category,
    model.seo.description,
    model.seo.tags,
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
    modelId = inserted.id;
  }

  await db.run('DELETE FROM model_3d_categories WHERE model_id = ?', [modelId]);
  for (const [index, categoryId] of categoryIds.entries()) {
    await db.run(
      'INSERT INTO model_3d_categories (model_id, category_id, is_primary) VALUES (?, ?, ?)',
      [modelId, categoryId, index === 0 ? 1 : 0]
    );
  }

  return existing ? 'updated' : 'inserted';
}

async function main() {
  await ensureSchema();
  await ensureDirectories();

  const models = await collectModels();
  const categoryIds = new Map();
  const counts = { inserted: 0, updated: 0 };

  const categoriesInUse = design3dCategories.filter(category => (
    models.some(model => model.seo.categoryNames.includes(category.name))
  ));
  for (const category of categoriesInUse) {
      categoryIds.set(category.name, await upsertCategory(category));
  }

  console.log(`Importing ${models.length} local 3D models from ${sourceRoot}`);
  for (const model of models) {
    const glbUrl = await copyAsset(model.glbPath, 'glb', `${model.slug}.glb`);
    const textureUrl = await copyAsset(model.svgPath, 'texture', `${model.slug}.svg`);
    const linkedCategoryIds = model.seo.categoryNames.map(name => categoryIds.get(name)).filter(Boolean);
    const result = await upsertModel(model, linkedCategoryIds, glbUrl, textureUrl);
    counts[result] += 1;
    console.log(`${result}: ${model.category.name}/${model.folderName} -> ${model.slug}`);
  }
  console.log(`Done: ${JSON.stringify(counts)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
