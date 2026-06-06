require('dotenv').config();
const db = require('../lib/db');
const { generateSlug } = require('../lib/slug');

async function main() {
  console.log('Adding slugs to existing models...\n');

  const tables = ['models_3d', 'models_2d', 'patterns', 'gallery_items', 'tools'];

  for (const table of tables) {
    try {
      // Check if slug column exists
      const columns = await db.all(`PRAGMA table_info(${table})`);
      const hasSlug = columns.some(col => col.name === 'slug');

      if (!hasSlug) {
        console.log(`  Adding slug column to ${table}...`);
        await db.run(`ALTER TABLE ${table} ADD COLUMN slug TEXT`);
      }

      // Update slugs for existing rows
      const rows = await db.all(`SELECT id, name FROM ${table} WHERE slug IS NULL OR slug = ''`);
      for (const row of rows) {
        const slug = generateSlug(row.name);
        await db.run(`UPDATE ${table} SET slug = ? WHERE id = ?`, [slug, row.id]);
        console.log(`  [${table}] #${row.id}: ${slug}`);
      }
    } catch (err) {
      console.log(`  Skipping ${table}: ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
