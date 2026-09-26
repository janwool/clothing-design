#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

// Reviewed against the published product covers, not inferred from the word "Top".
const changes = [
  {
    slug: 'relaxed-drop-shoulder-cuffed-top-3d-model-e316388e2194',
    name: 'Relaxed Drop-Shoulder Cuffed Sweatshirt',
    category: 'Hoodie',
    categorySlug: 'hoodie-mockup',
    garment: 'sweatshirt'
  },
  ...[
    'high-neck-straight-cut-long-sleeve-top-3d-model-0eee7d43debd',
    'high-neck-straight-cut-long-sleeve-top-3d-model-1a0aabbf0223',
    'high-neck-straight-cut-long-sleeve-top-3d-model-71c761942e61'
  ].map(slug => ({
    slug,
    name: 'High-Neck Straight-Cut Long-Sleeve T-Shirt',
    category: 'T-shirt',
    categorySlug: 't-shirt-mockup',
    garment: 'long-sleeve T-shirt'
  })),
  {
    slug: 'crewneck-fitted-long-sleeve-crop-top-3d-model-5ac0be86c1ff',
    name: 'Fitted Crewneck Long-Sleeve Crop T-Shirt',
    category: 'T-shirt',
    categorySlug: 't-shirt-mockup',
    garment: 'cropped T-shirt'
  },
  {
    slug: 'crewneck-three-quarter-sleeve-crop-top-3d-model-49f9ba2cd8d1',
    name: 'Crewneck Three-Quarter-Sleeve Crop T-Shirt',
    category: 'T-shirt',
    categorySlug: 't-shirt-mockup',
    garment: 'cropped T-shirt'
  }
];

async function main() {
  const apply = process.argv.includes('--apply');
  const manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'model-cover-source-manifest.json'), 'utf8'
  ));
  const categories = await db.all(`
    SELECT id, slug FROM categories
    WHERE resource_type = '3d-models' AND status = 'active'
      AND slug IN ('top', 'hoodie-mockup', 't-shirt-mockup')
  `);
  const categoryId = Object.fromEntries(categories.map(category => [category.slug, category.id]));
  if (Object.keys(categoryId).length !== 3) throw new Error('Missing required active 3D category');

  const pending = [];
  for (const change of changes) {
    const source = manifest.find(item => item.slug === change.slug);
    if (!source || source.category !== change.category || source.name !== change.name) {
      throw new Error(`Source manifest does not match reviewed classification for ${change.slug}`);
    }
    const model = await db.get(`
      SELECT m.id, m.slug, m.name, m.category, m.description, m.tags,
             mc.category_id AS primary_category_id
      FROM models_3d m
      LEFT JOIN model_3d_categories mc ON mc.model_id = m.id AND mc.is_primary = 1
      WHERE m.slug = ? AND m.status = 'active'
    `, [change.slug]);
    if (!model) throw new Error(`Missing active model ${change.slug}`);
    if (model.category === change.category) {
      if (model.primary_category_id !== categoryId[change.categorySlug] || model.name !== change.name) {
        throw new Error(`Partially applied classification for ${change.slug}`);
      }
      continue;
    }
    if (model.category !== 'Top' || model.primary_category_id !== categoryId.top) {
      throw new Error(`Unexpected current classification for ${change.slug}`);
    }
    pending.push({ model, change });
  }

  if (apply) {
    for (const { model, change } of pending) {
      const description = model.description.replace(
        /^[^.]+\. /,
        `${change.name} is an approved ${change.garment} 3D clothing model. `
      );
      const tags = model.tags.split(', ')
        .filter(tag => tag !== model.name && tag !== 'Top')
        .filter(tag => tag !== 'Pullovers' || change.category !== 'T-shirt');
      tags.unshift(change.name, change.category === 'T-shirt' ? 'T-shirt' : 'Sweatshirt');
      const updated = await db.run(`
        UPDATE models_3d
        SET name = ?, category = ?, description = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND category = 'Top' AND status = 'active'
      `, [change.name, change.category, description, [...new Set(tags)].join(', '), model.id]);
      if (updated.changes !== 1) throw new Error(`Failed to update ${change.slug}`);
      const mapping = await db.run(`
        UPDATE model_3d_categories SET category_id = ?
        WHERE model_id = ? AND category_id = ? AND is_primary = 1
      `, [categoryId[change.categorySlug], model.id, categoryId.top]);
      if (mapping.changes !== 1) throw new Error(`Failed to update category mapping for ${change.slug}`);
    }
  }

  console.log(JSON.stringify({
    database: process.env.DB_TYPE || 'sqlite',
    applied: apply,
    reviewed: changes.length,
    changed: pending.length,
    models: pending.map(({ model, change }) => ({
      id: model.id,
      from: model.category,
      to: change.category,
      name: change.name
    }))
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
