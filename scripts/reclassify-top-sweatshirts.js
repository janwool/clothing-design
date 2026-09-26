#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const expectedSlugs = [
  'crewneck-kangaroo-pocket-sweatshirt-3d-model-c2480f4cbd9b',
  'mock-neck-cuffed-sweatshirt-3d-model-76caaeaf258e',
  'mock-neck-cuffed-sweatshirt-3d-model-7e6d6789f1f1',
  'collared-long-sleeve-pullover-3d-model-207c8b71df5e',
  'relaxed-crewneck-sweatshirt-3d-model-deae7e9abc62',
  'crewneck-kangaroo-pocket-sweatshirt-3d-model-7d24445f596a',
  'mock-neck-cuffed-sweatshirt-3d-model-7ecd68809df6',
  'relaxed-crewneck-sweatshirt-3d-model-943b54317a1d',
  'collared-long-sleeve-pullover-3d-model-abf05cfba639',
  'collared-long-sleeve-pullover-3d-model-166f4f4c73e0',
  'relaxed-crewneck-sweatshirt-3d-model-9bf0887dc842',
  'crewneck-kangaroo-pocket-sweatshirt-3d-model-ca089cdfabf8'
];
const apply = process.argv.includes('--apply');

async function main() {
  if (expectedSlugs.length !== 12) {
    throw new Error(`Expected 12 reviewed Top sweatshirts, found ${expectedSlugs.length}`);
  }
  const manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'model-cover-source-manifest.json'), 'utf8'
  ));
  for (const slug of expectedSlugs) {
    const source = manifest.find(item => item.slug === slug);
    if (!source || source.category !== 'Hoodie') {
      throw new Error(`Missing reviewed Hoodie source classification for ${slug}`);
    }
  }

  const top = await db.get(
    "SELECT id FROM categories WHERE slug = 'top' AND resource_type = '3d-models' AND status = 'active'"
  );
  const hoodie = await db.get(
    "SELECT id FROM categories WHERE slug = 'hoodie-mockup' AND resource_type = '3d-models' AND status = 'active'"
  );
  if (!top || !hoodie) throw new Error('Missing active Top or Hoodie category');

  const rows = await db.all(`
    SELECT m.id, m.slug, m.name, m.category, m.description, m.tags,
           mc.category_id AS primary_category_id
    FROM models_3d m
    LEFT JOIN model_3d_categories mc ON mc.model_id = m.id AND mc.is_primary = 1
    WHERE m.slug IN (${expectedSlugs.map(() => '?').join(',')})
      AND m.status = 'active'
    ORDER BY m.id
  `, expectedSlugs);
  if (rows.length !== expectedSlugs.length) {
    throw new Error(`Expected ${expectedSlugs.length} active models, found ${rows.length}`);
  }

  const pending = rows.filter(row => row.category === 'Top');
  for (const row of rows) {
    if (!['Top', 'Hoodie'].includes(row.category)) {
      throw new Error(`Unexpected category ${row.category} for ${row.slug}`);
    }
    if (row.primary_category_id !== (row.category === 'Top' ? top.id : hoodie.id)) {
      throw new Error(`Unexpected primary category mapping for ${row.slug}`);
    }
  }

  if (apply) {
    for (const row of pending) {
      const garment = /Sweatshirt/i.test(row.name) ? 'sweatshirt' : 'pullover';
      const description = row.description.replace(
        /approved (?:Sweatshirts|Pullovers) Top 3D clothing model/i,
        `approved ${garment} 3D clothing model`
      );
      const tags = row.tags.replace(/, Top(?=,|$)/, '');
      const result = await db.run(`
        UPDATE models_3d
        SET category = 'Hoodie', description = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND category = 'Top' AND status = 'active'
      `, [description, tags, row.id]);
      if (result.changes !== 1) throw new Error(`Failed to update ${row.slug}`);
      const mapping = await db.run(`
        UPDATE model_3d_categories
        SET category_id = ?
        WHERE model_id = ? AND category_id = ? AND is_primary = 1
      `, [hoodie.id, row.id, top.id]);
      if (mapping.changes !== 1) throw new Error(`Failed to update category mapping for ${row.slug}`);
    }
  }

  console.log(JSON.stringify({
    database: process.env.DB_TYPE || 'sqlite',
    applied: apply,
    reviewed: rows.length,
    changed: pending.length,
    models: pending.map(({ slug, name }) => ({ slug, name, from: 'Top', to: 'Hoodie' }))
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
