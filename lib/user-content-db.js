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
      // Upgrade existing SQLite and D1 tables, including deployments predating soft deletion.
      const projectColumns = await db.all('PRAGMA table_info(design_projects)');
      if (!projectColumns.some(column => column.name === 'deleted_at')) {
        try {
          await db.run('ALTER TABLE design_projects ADD COLUMN deleted_at DATETIME');
        } catch (error) {
          // Another worker may have upgraded the shared database concurrently.
          const columns = await db.all('PRAGMA table_info(design_projects)');
          if (!columns.some(column => column.name === 'deleted_at')) throw error;
        }
      }
      await db.run('CREATE INDEX IF NOT EXISTS idx_design_projects_user_updated ON design_projects(user_id, updated_at DESC)');
      await db.run(`CREATE TABLE IF NOT EXISTS project_shares (
        token TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        preview_image_url TEXT NOT NULL,
        model_url TEXT,
        model_storage_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME,
        FOREIGN KEY (project_id) REFERENCES design_projects(id)
      )`);
      const shareColumns = await db.all('PRAGMA table_info(project_shares)');
      for (const columnName of ['model_url', 'model_storage_key']) {
        if (shareColumns.some(column => column.name === columnName)) continue;
        try { await db.run(`ALTER TABLE project_shares ADD COLUMN ${columnName} TEXT`); }
        catch (error) {
          const columns = await db.all('PRAGMA table_info(project_shares)');
          if (!columns.some(column => column.name === columnName)) throw error;
        }
      }
      await db.run('CREATE INDEX IF NOT EXISTS idx_project_shares_project ON project_shares(project_id, user_id, revoked_at)');
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
