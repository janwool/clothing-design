require('dotenv').config();
const db = require('../lib/db');

const OLD_DOMAIN = 'clothing-design.e489597fdfb0f919ee36dcdfcda08328.r2.cloudflarestorage.com';
const NEW_DOMAIN = 'cdn.cloz-design.com';

async function updateUrls(table, columns) {
  let updated = 0;
  for (const col of columns) {
    const rows = await db.all(`SELECT id, ${col} FROM ${table}`);
    for (const row of rows) {
      if (row[col] && row[col].includes(OLD_DOMAIN)) {
        const newUrl = row[col].replace(OLD_DOMAIN, NEW_DOMAIN);
        await db.run(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, [newUrl, row.id]);
        updated++;
        console.log(`  [${table}.${col}] #${row.id}: ${newUrl}`);
      }
    }
  }
  return updated;
}

async function main() {
  console.log('Updating R2 URLs in database...');
  console.log(`  ${OLD_DOMAIN} -> ${NEW_DOMAIN}\n`);

  let total = 0;

  total += await updateUrls('models_3d', ['file_url', 'image_url', 'texture_url']);
  total += await updateUrls('models_2d', ['file_url', 'image_url']);
  total += await updateUrls('patterns', ['file_url', 'image_url']);
  total += await updateUrls('gallery_items', ['image_url']);
  total += await updateUrls('tools', ['icon']);

  console.log(`\nDone! Updated ${total} URLs.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
