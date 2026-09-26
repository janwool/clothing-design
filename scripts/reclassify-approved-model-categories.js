#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const {
  categoryDescription,
  categoryMetaDescription,
  categoryMetaTitle
} = require('../lib/design3d-seo');

const apply = process.argv.includes('--apply');
const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'model-cover-source-manifest.json'), 'utf8'
));
const categoryDetails = {
  Sets: { slug: 'sets', sortOrder: 95, garment: 'coordinated outfit set', previous: ['Top', 'Shirt', 'Jacket', 'T-shirt', 'Hoodie', 'Blazer'] },
  Jumpsuit: { slug: 'jumpsuit', sortOrder: 90, garment: 'one-piece garment', previous: ['Pants'] },
  Swimwear: { slug: 'swimwear', sortOrder: 180, garment: 'swimwear', previous: ['Underwear'] },
  Socks: { slug: 'socks', sortOrder: 185, garment: 'sock', previous: ['Underwear'] }
};
const onePieceNames = new Set([
  'Cross-Back Turn-Up Straight-Leg Overalls',
  'Cross-Strap High-Waisted Tapered Overalls',
  'Chest-Pocket Paneled Jogger Overalls',
  'Stand-Collar Open-Front Sleeveless Romper'
]);
const sockNames = new Set(['Ankle Socks', 'Over-the-Knee Socks', 'Bow-Detail Crew Socks']);

function reviewedTarget(item) {
  if (/\bSet(?: with .+)?$/.test(item.name)) return 'Sets';
  if (onePieceNames.has(item.name)) return 'Jumpsuit';
  if (item.name === 'Asymmetric Double-Strap Two-Piece Swimsuit') return 'Swimwear';
  if (sockNames.has(item.name)) return 'Socks';
  return null;
}

async function ensureCategory(name) {
  const details = categoryDetails[name];
  let category = await db.get('SELECT id, resource_type, status FROM categories WHERE slug = ?', [details.slug]);
  if (category) {
    if (category.resource_type !== '3d-models' || category.status !== 'active') {
      throw new Error(`Category ${details.slug} is unavailable`);
    }
    return category.id;
  }
  if (!apply) return null;
  await db.run(`
    INSERT INTO categories
      (name, slug, resource_type, description, meta_title, meta_description, sort_order, status)
    VALUES (?, ?, '3d-models', ?, ?, ?, ?, 'active')
  `, [name, details.slug, categoryDescription(name), categoryMetaTitle(name),
    categoryMetaDescription(name), details.sortOrder]);
  category = await db.get('SELECT id FROM categories WHERE slug = ? AND resource_type = ?', [details.slug, '3d-models']);
  if (!category) throw new Error(`Failed to create category ${details.slug}`);
  return category.id;
}

async function main() {
  const reviewed = manifest
    .map(item => ({ ...item, target: reviewedTarget(item) }))
    .filter(item => item.target);
  const expected = { Sets: 20, Jumpsuit: 4, Swimwear: 1, Socks: 3 };
  for (const [name, count] of Object.entries(expected)) {
    const matching = reviewed.filter(item => item.target === name);
    if (matching.length !== count || matching.some(item => item.category !== name)) {
      throw new Error(`Expected ${count} reviewed ${name} entries in source manifest`);
    }
  }

  const pending = [];
  for (const item of reviewed) {
    const model = await db.get(`
      SELECT m.id, m.slug, m.name, m.category, m.description, m.tags,
             mc.category_id AS primary_category_id, c.slug AS primary_category_slug
      FROM models_3d m
      LEFT JOIN model_3d_categories mc ON mc.model_id = m.id AND mc.is_primary = 1
      LEFT JOIN categories c ON c.id = mc.category_id
      WHERE m.slug = ? AND m.status = 'active'
    `, [item.slug]);
    if (!model || model.name !== item.name) throw new Error(`Missing or renamed active model ${item.slug}`);
    if (model.category === item.target) {
      if (model.primary_category_slug !== categoryDetails[item.target].slug) {
        throw new Error(`Incomplete mapping for ${item.slug}`);
      }
      continue;
    }
    if (!categoryDetails[item.target].previous.includes(model.category) ||
        !model.primary_category_id || model.primary_category_slug === categoryDetails[item.target].slug) {
      throw new Error(`Unexpected current category for ${item.slug}: ${model.category}`);
    }
    pending.push({ item, model });
  }

  if (apply) {
    const ids = {};
    for (const name of Object.keys(categoryDetails)) ids[name] = await ensureCategory(name);
    for (const { item, model } of pending) {
      const details = categoryDetails[item.target];
      const description = model.description.replace(
        /^[^.]+\. /,
        `${model.name} is an approved ${details.garment} 3D model. `
      );
      const tags = model.tags.split(', ')
        .filter(tag => tag !== model.category && tag !== item.target);
      tags.splice(1, 0, item.target);
      const updated = await db.run(`
        UPDATE models_3d
        SET category = ?, description = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND category = ? AND status = 'active'
      `, [item.target, description, [...new Set(tags)].join(', '), model.id, model.category]);
      if (updated.changes !== 1) throw new Error(`Failed to update ${item.slug}`);
      const mapped = await db.run(`
        UPDATE model_3d_categories SET category_id = ?
        WHERE model_id = ? AND category_id = ? AND is_primary = 1
      `, [ids[item.target], model.id, model.primary_category_id]);
      if (mapped.changes !== 1) throw new Error(`Failed to update category mapping for ${item.slug}`);
    }
  }

  console.log(JSON.stringify({
    database: process.env.DB_TYPE || 'sqlite',
    applied: apply,
    reviewed: reviewed.length,
    changed: pending.length,
    changesByCategory: Object.fromEntries(Object.keys(categoryDetails).map(name => [
      name, pending.filter(({ item }) => item.target === name).length
    ]))
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
