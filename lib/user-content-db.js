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
      await db.run(`CREATE TABLE IF NOT EXISTS ai_try_on_results (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        image_id TEXT NOT NULL UNIQUE,
        model_id TEXT,
        model_slug TEXT,
        model_name TEXT,
        source_project_id TEXT,
        person_model_id TEXT,
        person_model_name TEXT,
        ai_model TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (image_id) REFERENCES user_images(id)
      )`);
      await db.run('CREATE INDEX IF NOT EXISTS idx_ai_try_on_results_user_created ON ai_try_on_results(user_id, created_at DESC)');
    })().catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

module.exports = { ensureUserContentTables };
