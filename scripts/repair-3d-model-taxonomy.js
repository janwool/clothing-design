require('dotenv').config();

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

const db = require('../lib/db');
const {
  hasAssetTaxonomyMismatch,
  repairedModelFields
} = require('../lib/model-asset-taxonomy');

const applyChanges = process.argv.includes('--apply');

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
}

async function loadModels() {
  return db.all(`
    SELECT
      m.id,
      m.slug,
      m.name,
      m.category,
      m.description,
      m.tags,
      m.image_url,
      m.file_url,
      COALESCE(primary_category.slug, legacy_category.slug) AS category_slug
    FROM models_3d m
    LEFT JOIN categories legacy_category
      ON m.category = legacy_category.name AND legacy_category.resource_type = '3d-models'
    LEFT JOIN categories primary_category
      ON primary_category.id = (
        SELECT mc.category_id
        FROM model_3d_categories mc
        WHERE mc.model_id = m.id
        ORDER BY mc.is_primary DESC, mc.category_id ASC
        LIMIT 1
      )
    WHERE m.status = ?
    ORDER BY m.id
  `, ['active']);
}

async function main() {
  await ensureSchema();
  const models = await loadModels();
  const repairs = models
    .filter(hasAssetTaxonomyMismatch)
    .map(model => ({ model, fields: repairedModelFields(model) }))
    .filter(item => item.fields);

  const allSlugs = new Map(models.map(model => [model.slug, model.id]));
  for (const { model, fields } of repairs) {
    const owner = allSlugs.get(fields.slug);
    if (owner && owner !== model.id) {
      throw new Error(`Cannot repair model ${model.id}: slug ${fields.slug} belongs to model ${owner}`);
    }
  }

  if (applyChanges) {
    const categories = await db.all(
      `SELECT id, slug FROM categories WHERE resource_type = ? AND status = ?`,
      ['3d-models', 'active']
    );
    const categoryIds = new Map(categories.map(category => [category.slug, category.id]));

    for (const { model, fields } of repairs) {
      const categoryId = categoryIds.get(fields.categorySlug);
      if (!categoryId) {
        throw new Error(`Missing active 3D category ${fields.categorySlug}`);
      }
      await db.run(
        `UPDATE models_3d
         SET name = ?, slug = ?, category = ?, description = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [fields.name, fields.slug, fields.category, fields.description, fields.tags, model.id]
      );
      if (model.slug && model.slug !== fields.slug) {
        await db.run(
          `INSERT OR REPLACE INTO model_3d_slug_redirects (old_slug, model_id)
           VALUES (?, ?)`,
          [model.slug, model.id]
        );
      }
      await db.run('DELETE FROM model_3d_categories WHERE model_id = ?', [model.id]);
      await db.run(
        `INSERT INTO model_3d_categories (model_id, category_id, is_primary)
         VALUES (?, ?, 1)`,
        [model.id, categoryId]
      );
    }
  }

  console.log(JSON.stringify({
    applied: applyChanges,
    examined: models.length,
    repaired: repairs.length,
    sample: repairs.slice(0, 20).map(({ model, fields }) => ({
      id: model.id,
      from: { category: model.category_slug, name: model.name, slug: model.slug },
      to: { category: fields.categorySlug, name: fields.name, slug: fields.slug }
    }))
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
