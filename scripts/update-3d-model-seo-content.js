require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const {
  applyUniqueSeoNames,
  buildSeoContent,
  categoryDescription,
  categoryMetaDescription,
  categoryMetaTitle,
  design3dCategories,
  stableSlug
} = require('../lib/design3d-seo');

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

const db = require('../lib/db');

const sourceRoot = path.join(process.env.HOME || '/Users/chengwuxue', '3D模型');
const dryRun = process.argv.includes('--dry-run');
const importCategoryNames = new Set([
  'T-shirt',
  'Shirt',
  'Pants',
  'Jacket',
  'Hoodie',
  'Dress',
  'Cloak',
  'Underwear',
  'Jumpsuit',
  'Skirt',
  'Blazer',
  'Coat',
  'Hat',
  'Top'
]);
const importCategories = design3dCategories.filter(category => importCategoryNames.has(category.name));

async function ensureSchema() {
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
  await db.run('ALTER TABLE categories ADD COLUMN landing_content TEXT').catch(() => {});
  await db.run('ALTER TABLE models_3d ADD COLUMN slug TEXT').catch(() => {});
  await db.run('ALTER TABLE models_3d ADD COLUMN texture_url TEXT').catch(() => {});
}

async function collectSourceModels() {
  const models = [];
  for (const category of importCategories) {
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
      try {
        await fs.access(path.join(dir, 'model_packed_uv.glb'));
        await fs.access(path.join(dir, 'pattern.svg'));
      } catch {
        continue;
      }

      index += 1;
      const slug = stableSlug(category, index, `${category.name}/${folderName}`);
      models.push({
        category,
        folderName,
        slug,
        seo: buildSeoContent({ category, folderName, variantIndex: index - 1 })
      });
    }
  }
  return applyUniqueSeoNames(models);
}

async function upsertCategory(category) {
  const existing = await db.get('SELECT id, resource_type FROM categories WHERE slug = ?', [category.slug]);
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
    if (!dryRun) {
      await db.run(
        `UPDATE categories
         SET name = ?, slug = ?, resource_type = ?, description = ?, meta_title = ?, meta_description = ?,
             sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [...params, existing.id]
      );
    }
    return existing.id;
  }

  if (dryRun) return null;
  const result = await db.run(
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return result.lastID;
}

async function syncCategories(modelId, categoryIds) {
  if (dryRun) return;
  await db.run('DELETE FROM model_3d_categories WHERE model_id = ?', [modelId]);
  for (const [index, categoryId] of categoryIds.entries()) {
    await db.run(
      'INSERT INTO model_3d_categories (model_id, category_id, is_primary) VALUES (?, ?, ?)',
      [modelId, categoryId, index === 0 ? 1 : 0]
    );
  }
}

async function getRedirectMap() {
  const rows = await db.all('SELECT old_slug, model_id FROM model_3d_slug_redirects');
  return new Map((rows || []).map(row => [row.old_slug, row.model_id]));
}

function getModelForSource(sourceModel, remoteBySlug, remoteById, redirectMap) {
  return (
    remoteBySlug.get(sourceModel.legacySlug) ||
    remoteBySlug.get(sourceModel.slug) ||
    remoteById.get(redirectMap.get(sourceModel.legacySlug))
  );
}

async function main() {
  await ensureSchema();
  const sourceModels = await collectSourceModels();
  const remoteModels = await db.all('SELECT id, slug, name, category, description, tags FROM models_3d ORDER BY id');
  const remoteBySlug = new Map(remoteModels.map(model => [model.slug, model]));
  const remoteById = new Map(remoteModels.map(model => [model.id, model]));
  const redirectMap = await getRedirectMap();
  const matchedModels = sourceModels.filter(model => getModelForSource(model, remoteBySlug, remoteById, redirectMap));
  const categoriesInUse = design3dCategories.filter(category => (
    matchedModels.some(model => model.seo.categoryNames.includes(category.name))
  ));
  const categoryIds = new Map();

  for (const category of categoriesInUse) {
    categoryIds.set(category.name, await upsertCategory(category));
  }

  let updated = 0;
  let skipped = 0;
  const preview = [];
  for (const model of matchedModels) {
    const current = getModelForSource(model, remoteBySlug, remoteById, redirectMap);
    const needsContentUpdate = (
      current.name !== model.seo.name ||
      current.slug !== model.slug ||
      current.category !== model.seo.category ||
      current.description !== model.seo.description ||
      current.tags !== model.seo.tags
    );
    if (!needsContentUpdate) {
      skipped += 1;
      continue;
    }
    const linkedCategoryIds = model.seo.categoryNames.map(name => categoryIds.get(name)).filter(Boolean);
    preview.push({
      oldSlug: current.slug,
      newSlug: model.slug,
      from: current.name,
      to: model.seo.name,
      category: model.seo.category,
      source: `${model.category.name}/${model.folderName}`
    });

    if (!dryRun) {
      await db.run(
        `UPDATE models_3d
         SET name = ?, slug = ?, category = ?, description = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [model.seo.name, model.slug, model.seo.category, model.seo.description, model.seo.tags, current.id]
      );
      if (current.slug !== model.slug) {
        await db.run(
          'INSERT OR REPLACE INTO model_3d_slug_redirects (old_slug, model_id) VALUES (?, ?)',
          [current.slug, current.id]
        );
        if (model.legacySlug !== current.slug) {
          await db.run(
            'INSERT OR REPLACE INTO model_3d_slug_redirects (old_slug, model_id) VALUES (?, ?)',
            [model.legacySlug, current.id]
          );
        }
      }
      await syncCategories(current.id, linkedCategoryIds);
    }
    updated += 1;
  }

  const unmatchedSource = sourceModels
    .filter(model => !getModelForSource(model, remoteBySlug, remoteById, redirectMap))
    .map(model => model.legacySlug);
  const placeholderCount = remoteModels.filter(model => /\b3D Model \d{2}\b/.test(model.name)).length;
  console.log(JSON.stringify({
    dryRun,
    sourceCount: sourceModels.length,
    remoteCount: remoteModels.length,
    matchedCount: matchedModels.length,
    updated,
    skipped,
    placeholderCountBefore: placeholderCount,
    unmatchedSource,
    sample: preview.slice(0, 12)
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
