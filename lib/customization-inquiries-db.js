const db = require('./db');

let customizationInquiriesTableReady;

async function ensureCustomizationInquiriesTable() {
  if (!customizationInquiriesTableReady) {
    customizationInquiriesTableReady = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS customization_inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_code TEXT UNIQUE NOT NULL,
        model_id INTEGER,
        model_slug TEXT,
        model_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        notes TEXT,
        snapshot_3d_url TEXT NOT NULL,
        snapshot_3d_key TEXT NOT NULL,
        snapshot_2d_url TEXT NOT NULL,
        snapshot_2d_key TEXT NOT NULL,
        source_url TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.run(
        'CREATE INDEX IF NOT EXISTS idx_customization_inquiries_status_created ON customization_inquiries (status, created_at)'
      );
      const columns = await db.all('PRAGMA table_info(customization_inquiries)');
      return {
        hasLegacyContactColumns: columns.some(column => column.name === 'phone')
      };
    })().catch(error => {
      customizationInquiriesTableReady = null;
      throw error;
    });
  }

  return customizationInquiriesTableReady;
}

module.exports = {
  ensureCustomizationInquiriesTable
};
