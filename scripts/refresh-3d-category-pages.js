require('dotenv').config();

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

const db = require('../lib/db');
const {
  buildModelCategoryLandingContent,
  categoryDescription,
  categoryMetaDescription,
  categoryMetaTitle,
  design3dCategories,
  inferCategoryNamesFromModelName
} = require('../lib/design3d-seo');

const dryRun = process.argv.includes('--dry-run');
const useD1Batch = process.env.DB_TYPE === 'd1' && !dryRun;

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '0';
}

async function executeD1SqlBatch(statements, chunkSize = 80) {
  const accountId = process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    throw new Error('D1 batch mode requires CF_ACCOUNT_ID, D1_DATABASE_ID, and CF_API_TOKEN.');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  let executed = 0;
  for (let index = 0; index < statements.length; index += chunkSize) {
    const chunk = statements.slice(index, index + chunkSize);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql: chunk.join('\n') })
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'D1 batch query failed');
    }
    executed += chunk.length;
  }
  return executed;
}

async function ensureSchema() {
  await db.run('ALTER TABLE categories ADD COLUMN landing_content TEXT').catch(() => {});
  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_categories (
    model_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_id, category_id)
  )`);
}

async function upsertCategory(category) {
  const landingContent = JSON.stringify(buildModelCategoryLandingContent(category.name));
  const params = [
    category.name,
    category.slug,
    '3d-models',
    categoryDescription(category.name),
    categoryMetaTitle(category.name),
    categoryMetaDescription(category.name),
    landingContent,
    category.sort_order,
    'active'
  ];
  const existing = await db.get('SELECT id, resource_type FROM categories WHERE slug = ?', [category.slug]);

  if (existing) {
    if (existing.resource_type !== '3d-models') {
      throw new Error(`Category slug ${category.slug} already belongs to ${existing.resource_type}`);
    }
    if (!dryRun) {
      await db.run(
        `UPDATE categories
         SET name = ?, slug = ?, resource_type = ?, description = ?, meta_title = ?, meta_description = ?,
             landing_content = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [...params, existing.id]
      );
    }
    return existing.id;
  }

  if (dryRun) return null;
  const result = await db.run(
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return result.lastID;
}

function getCategoryUpsertStatements(category) {
  const landingContent = JSON.stringify(buildModelCategoryLandingContent(category.name));
  return [
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order, status)
     VALUES (${sqlString(category.name)}, ${sqlString(category.slug)}, '3d-models', ${sqlString(categoryDescription(category.name))}, ${sqlString(categoryMetaTitle(category.name))}, ${sqlString(categoryMetaDescription(category.name))}, ${sqlString(landingContent)}, ${sqlNumber(category.sort_order)}, 'active')
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name,
       resource_type = excluded.resource_type,
       description = excluded.description,
       meta_title = excluded.meta_title,
       meta_description = excluded.meta_description,
       landing_content = excluded.landing_content,
       sort_order = excluded.sort_order,
       status = excluded.status,
       updated_at = CURRENT_TIMESTAMP;`
  ];
}

async function syncModelCategories(model, categoryIdsByName) {
  const categoryNames = inferCategoryNamesFromModelName(model.name, model.category);
  const linkedIds = categoryNames.map(name => categoryIdsByName.get(name)).filter(Boolean);
  if (!linkedIds.length) return { categoryNames, updated: false };

  if (!dryRun) {
    await db.run('DELETE FROM model_3d_categories WHERE model_id = ?', [model.id]);
    for (const [index, categoryId] of linkedIds.entries()) {
      await db.run(
        'INSERT INTO model_3d_categories (model_id, category_id, is_primary) VALUES (?, ?, ?)',
        [model.id, categoryId, index === 0 ? 1 : 0]
      );
    }
    await db.run(
      'UPDATE models_3d SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [categoryNames[0], model.id]
    );
  }

  return { categoryNames, updated: true };
}

function getModelCategorySyncStatements(model) {
  const categoryNames = inferCategoryNamesFromModelName(model.name, model.category);
  if (!categoryNames.length) return { categoryNames, statements: [] };
  const statements = [
    `DELETE FROM model_3d_categories WHERE model_id = ${sqlNumber(model.id)};`,
    `UPDATE models_3d SET category = ${sqlString(categoryNames[0])}, updated_at = CURRENT_TIMESTAMP WHERE id = ${sqlNumber(model.id)};`
  ];
  for (const [index, categoryName] of categoryNames.entries()) {
    const category = design3dCategories.find(item => item.name === categoryName);
    if (!category) continue;
    statements.push(
      `INSERT OR REPLACE INTO model_3d_categories (model_id, category_id, is_primary)
       SELECT ${sqlNumber(model.id)}, id, ${index === 0 ? 1 : 0}
       FROM categories
       WHERE slug = ${sqlString(category.slug)} AND resource_type = '3d-models';`
    );
  }
  return { categoryNames, statements };
}

async function main() {
  await ensureSchema();

  if (useD1Batch) {
    const models = await db.all('SELECT id, name, category FROM models_3d WHERE status = ? ORDER BY id', ['active']);
    const statements = [];
    const categoryCounts = new Map();
    let updated = 0;

    for (const category of design3dCategories) {
      statements.push(...getCategoryUpsertStatements(category));
    }

    for (const model of models) {
      const result = getModelCategorySyncStatements(model);
      if (!result.statements.length) continue;
      statements.push(...result.statements);
      updated += 1;
      for (const categoryName of result.categoryNames) {
        categoryCounts.set(categoryName, (categoryCounts.get(categoryName) || 0) + 1);
      }
    }

    const executedStatements = await executeD1SqlBatch(statements);
    console.log(JSON.stringify({
      dryRun,
      mode: 'd1-batch',
      categories: design3dCategories.length,
      activeModels: models.length,
      updatedModels: updated,
      executedStatements,
      categoryCounts: Object.fromEntries([...categoryCounts.entries()].sort((a, b) => b[1] - a[1]))
    }, null, 2));
    return;
  }

  const categoryIdsByName = new Map();
  for (const category of design3dCategories) {
    categoryIdsByName.set(category.name, await upsertCategory(category));
  }

  const models = await db.all('SELECT id, name, category FROM models_3d WHERE status = ? ORDER BY id', ['active']);
  const categoryCounts = new Map();
  let updated = 0;

  for (const model of models) {
    const result = await syncModelCategories(model, categoryIdsByName);
    if (!result.updated) continue;
    updated += 1;
    for (const categoryName of result.categoryNames) {
      categoryCounts.set(categoryName, (categoryCounts.get(categoryName) || 0) + 1);
    }
  }

  console.log(JSON.stringify({
    dryRun,
    categories: design3dCategories.length,
    activeModels: models.length,
    updatedModels: updated,
    categoryCounts: Object.fromEntries([...categoryCounts.entries()].sort((a, b) => b[1] - a[1]))
  }, null, 2));
}

main()
  .then(() => {
    if (typeof db.close === 'function') db.close();
  })
  .catch(err => {
    console.error(err);
    if (typeof db.close === 'function') db.close();
    process.exit(1);
  });
