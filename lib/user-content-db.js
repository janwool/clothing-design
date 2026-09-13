const db = require('./db');

let readyPromise;

function ensureUserContentTables() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS user_images (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'artwork',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      await db.run('CREATE INDEX IF NOT EXISTS idx_user_images_user_created ON user_images(user_id, created_at DESC)');
      await db.run(`CREATE TABLE IF NOT EXISTS design_projects (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        project_type TEXT NOT NULL,
        name TEXT NOT NULL,
        source_id TEXT,
        source_url TEXT NOT NULL,
        preview_image_url TEXT,
        design_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      await db.run('CREATE INDEX IF NOT EXISTS idx_design_projects_user_updated ON design_projects(user_id, updated_at DESC)');
    })().catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

module.exports = { ensureUserContentTables };

